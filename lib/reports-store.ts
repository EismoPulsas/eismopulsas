import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { distance } from "./data";
import { MERGE_RADIUS_M, type Report, type ReportCategory } from "./reports";

// Storage for user reports. Uses Postgres (Neon) when DATABASE_URL is set,
// otherwise a JSON file in .data/ so local development works with no setup.
// (On a read-only filesystem the file store falls back to memory.)

type NewReport = { lat: number; lng: number; category: ReportCategory; note: string | null };
export type SubmitResult = { report: Report; merged: boolean; alreadyVoted: boolean };

interface Store {
  list(): Promise<Report[]>;
  submit(input: NewReport, voter: string): Promise<SubmitResult>;
  vote(id: number, voter: string): Promise<{ report: Report; alreadyVoted: boolean } | null>;
}

// ---------------------------------------------------------------- Postgres

function pgStore(url: string): Store {
  const sql = neon(url);
  let ready: Promise<unknown> | null = null;
  const init = () =>
    (ready ??= (async () => {
      await sql`CREATE TABLE IF NOT EXISTS reports (
        id         SERIAL PRIMARY KEY,
        lat        DOUBLE PRECISION NOT NULL,
        lng        DOUBLE PRECISION NOT NULL,
        category   TEXT NOT NULL,
        note       TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS report_votes (
        report_id  INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
        voter      TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (report_id, voter)
      )`;
      await sql`CREATE INDEX IF NOT EXISTS reports_category_lat_lng ON reports (category, lat, lng)`;
    })());

  const select = async (where: "all" | number) => {
    const rows =
      where === "all"
        ? await sql`SELECT r.id, r.lat, r.lng, r.category, r.note, r.created_at,
                      (SELECT count(*) FROM report_votes v WHERE v.report_id = r.id)::int AS votes
                    FROM reports r ORDER BY r.id`
        : await sql`SELECT r.id, r.lat, r.lng, r.category, r.note, r.created_at,
                      (SELECT count(*) FROM report_votes v WHERE v.report_id = r.id)::int AS votes
                    FROM reports r WHERE r.id = ${where}`;
    return rows.map(
      (r): Report => ({
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        category: r.category,
        note: r.note,
        votes: r.votes,
        createdAt: new Date(r.created_at).toISOString(),
      }),
    );
  };

  const addVote = async (id: number, voter: string) => {
    const res = await sql`INSERT INTO report_votes (report_id, voter) VALUES (${id}, ${voter})
                          ON CONFLICT DO NOTHING RETURNING report_id`;
    return res.length > 0;
  };

  return {
    async list() {
      await init();
      return select("all");
    },
    async submit(input, voter) {
      await init();
      // Rough pre-filter in degrees (~100 m), exact distance check below.
      const near = await sql`SELECT id, lat, lng FROM reports WHERE category = ${input.category}
        AND lat BETWEEN ${input.lat - 0.001} AND ${input.lat + 0.001}
        AND lng BETWEEN ${input.lng - 0.0016} AND ${input.lng + 0.0016}`;
      const hit = near.find((r) => distance(r.lat, r.lng, input.lat, input.lng) <= MERGE_RADIUS_M);
      if (hit) {
        const added = await addVote(hit.id, voter);
        return { report: (await select(hit.id))[0], merged: true, alreadyVoted: !added };
      }
      const [row] = await sql`INSERT INTO reports (lat, lng, category, note)
        VALUES (${input.lat}, ${input.lng}, ${input.category}, ${input.note}) RETURNING id`;
      await addVote(row.id, voter);
      return { report: (await select(row.id))[0], merged: false, alreadyVoted: false };
    },
    async vote(id, voter) {
      await init();
      const existing = await select(id);
      if (!existing.length) return null;
      const added = await addVote(id, voter);
      return { report: (await select(id))[0], alreadyVoted: !added };
    },
  };
}

// ---------------------------------------------------------------- JSON file

type FileData = { nextId: number; reports: (Omit<Report, "votes"> & { voters: string[] })[] };

function fileStore(): Store {
  const file = path.join(process.cwd(), ".data", "reports.json");
  let memory: FileData | null = null;
  let writable = true;
  let queue: Promise<unknown> = Promise.resolve();

  const load = async (): Promise<FileData> => {
    if (memory) return memory;
    try {
      memory = JSON.parse(await fs.readFile(file, "utf8")) as FileData;
    } catch {
      memory = { nextId: 1, reports: [] };
    }
    return memory;
  };
  const save = async () => {
    if (!writable || !memory) return;
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(memory, null, 1));
    } catch (err) {
      writable = false;
      console.warn("Reports file is not writable, keeping reports in memory only:", err);
    }
  };
  // Serialise mutations so concurrent requests don't lose writes.
  const locked = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };
  const view = (r: FileData["reports"][number]): Report => {
    const { voters, ...rest } = r;
    return { ...rest, votes: voters.length };
  };

  return {
    async list() {
      return (await load()).reports.map(view);
    },
    submit: (input, voter) =>
      locked(async () => {
        const data = await load();
        const hit = data.reports.find(
          (r) => r.category === input.category && distance(r.lat, r.lng, input.lat, input.lng) <= MERGE_RADIUS_M,
        );
        if (hit) {
          const alreadyVoted = hit.voters.includes(voter);
          if (!alreadyVoted) hit.voters.push(voter);
          await save();
          return { report: view(hit), merged: true, alreadyVoted };
        }
        const r = { id: data.nextId++, ...input, createdAt: new Date().toISOString(), voters: [voter] };
        data.reports.push(r);
        await save();
        return { report: view(r), merged: false, alreadyVoted: false };
      }),
    vote: (id, voter) =>
      locked(async () => {
        const data = await load();
        const r = data.reports.find((x) => x.id === id);
        if (!r) return null;
        const alreadyVoted = r.voters.includes(voter);
        if (!alreadyVoted) r.voters.push(voter);
        await save();
        return { report: view(r), alreadyVoted };
      }),
  };
}

/** Anonymous per-browser id sent by the client, used for one-vote-per-person. */
export function voterId(req: Request): string | null {
  const v = req.headers.get("x-voter-id");
  return v && /^[a-zA-Z0-9-]{8,64}$/.test(v) ? v : null;
}

let store: Store | null = null;
export function reportsStore(): Store {
  return (store ??= process.env.DATABASE_URL ? pgStore(process.env.DATABASE_URL) : fileStore());
}
