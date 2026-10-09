import { StyleSheet, View } from "react-native";

import type { Leg } from "@/api/contract";
import { AppText } from "@/ui/text";
import { radius, space, useColors } from "@/ui/tokens";

/** react-native-maps has no web implementation; the product is Android-first. */
export function RouteMap(_props: { legs: Leg[] }) {
  const c = useColors();
  return (
    <View style={[styles.frame, { backgroundColor: c.skeleton }]}>
      <AppText variant="meta" color="ink2">
        Žemėlapis rodomas Android programėlėje. Visos atkarpos išvardytos žemiau.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { padding: space.l, borderRadius: radius.control },
});
