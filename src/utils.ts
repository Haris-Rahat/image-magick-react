export const toCoord = (value?: string) =>
  !value
    ? "+0"
    : ["+", "-"].some((p) => value.includes(p))
    ? value
    : `+${value}`;
