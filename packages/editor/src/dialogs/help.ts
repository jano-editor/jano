import { showDialog } from "@jano-editor/ui";
import type { Session } from "./session.ts";
import { CLI_COMMANDS } from "../cli.ts";

export async function showHelp(s: Session): Promise<void> {
  s.dialogOpen = true;

  const version = process.env.JANO_VERSION || "dev";
  const helpText = [
    `jano v${version}`,
    "",
    "Shortcuts:",
    "  Ctrl+S        Save",
    "  Ctrl+Q        Exit",
    "  Ctrl+Z / Y    Undo / Redo",
    "  Ctrl+X / C / V Cut / Copy / Paste",
    "  Ctrl+A        Select All",
    "  Ctrl+F        Search & Replace",
    "  Ctrl+G        Go to Line",
    "  Ctrl+D        Select Next Occurrence",
    "  Ctrl+Shift+↕  Multi-Cursor",
    "  Shift+Arrow   Select",
    "  Ctrl+Arrow    Word Jump",
    "  Alt+↑↓        Move Line",
    "  F1            Help",
    "  F2            History Browser",
    "  F3            Format (plugin)",
    "  F4            Diagnostics",
    "  F9            Settings",
    "  Esc           Clear Multi-Cursor",
    "",
    "CLI Commands:",
    ...CLI_COMMANDS,
  ].join("\n");

  await showDialog(
    s.screen,
    s.draw,
    {
      title: "Help",
      message: helpText,
      buttons: [{ label: "Close", value: "close" }],
      border: "round",
      width: 50,
    },
    s.update,
  );

  s.dialogOpen = false;
  s.update();
}
