import { Text, type TextProps } from "react-native";

import { type, useColors, type Palette } from "@/ui/tokens";

type Variant = keyof typeof type;

/** The only text primitive: a type-scale variant + a semantic colour. */
export function AppText({ variant = "body", color = "ink", style, ...rest }: TextProps & { variant?: Variant; color?: keyof Palette }) {
  const c = useColors();
  return <Text style={[type[variant], { color: c[color] }, style]} {...rest} />;
}
