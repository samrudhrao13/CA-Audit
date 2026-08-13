import { UserCircleIcon, SettingsIcon } from "./icons";

/** Profile silhouette with a small settings-gear badge overlapping its bottom-right — one
 *  combined mark for "your account / settings," not two separate buttons. */
export function AccountIcon({ size = 26 }) {
  const badgeSize = Math.round(size * 0.5);
  const badgeBox = badgeSize + 6;

  return (
    <span style={{ position: "relative", display: "inline-flex", width: size, height: size, flexShrink: 0 }}>
      <UserCircleIcon size={size} />
      <span
        style={{
          position: "absolute",
          right: -4,
          bottom: -4,
          width: badgeBox,
          height: badgeBox,
          borderRadius: "50%",
          background: "var(--surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SettingsIcon size={badgeSize} />
      </span>
    </span>
  );
}
