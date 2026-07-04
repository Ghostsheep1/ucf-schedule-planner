export function formatInstructorName(rawName = "") {
  const clean = rawName.replace(/\s+/g, " ").trim();
  if (!clean) return "TBA";
  if (/^(tba|staff)$/i.test(clean)) return clean.toUpperCase();
  if (/^to be announced$/i.test(clean)) return "To be Announced";

  return clean
    .split(" ")
    .map((word) =>
      word
        .split("-")
        .map((part) =>
          part
            .split("'")
            .map(titleNamePart)
            .join("'")
        )
        .join("-")
    )
    .join(" ");
}

function titleNamePart(part: string) {
  if (!part) return part;
  const lower = part.toLowerCase();
  if (lower.length <= 1) return lower.toUpperCase();
  return lower[0].toUpperCase() + lower.slice(1);
}
