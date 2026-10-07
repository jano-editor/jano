import {
  closeSync,
  existsSync,
  fchmodSync,
  fchownSync,
  fsyncSync,
  openSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
  type Stats,
} from "node:fs";
import { basename, dirname, join } from "node:path";

/**
 * How the file was written:
 * - "atomic": temp file + rename, the file is either fully old or fully new
 * - "direct": written in place (hard links, or a folder we can't create files in)
 */
export type WriteMode = "atomic" | "direct";

/**
 * Writes a file without ever leaving it half written. Keeps permissions and owner,
 * writes through symlinks instead of replacing them, and keeps hard links intact.
 */
export function writeFileSafely(filePath: string, content: string): WriteMode {
  // follow symlinks, so the link stays a link and its target gets the new content
  const target = existsSync(filePath) ? realpathSync(filePath) : filePath;
  const stat = existsSync(target) ? statSync(target) : null;

  // a rename would split hard links: only this name would see the new content
  if (stat && stat.nlink > 1) {
    writeFileSync(target, content, "utf8");
    return "direct";
  }

  const tmp = join(dirname(target), `.${basename(target)}.jano-${process.pid}-${Date.now()}.tmp`);
  let fd: number;
  try {
    // keep the permissions of the existing file, new files get the usual default
    fd = openSync(tmp, "wx", stat ? stat.mode & 0o7777 : 0o666);
  } catch (err) {
    // folder not writable (e.g. a writable file in /etc): fall back to writing in place
    if (isPermissionError(err)) {
      writeFileSync(target, content, "utf8");
      return "direct";
    }
    throw err;
  }

  try {
    writeSync(fd, content, null, "utf8");
    if (stat) {
      // the mode passed to open is filtered by the umask, set it explicitly
      fchmodSync(fd, stat.mode & 0o7777);
      keepOwner(fd, stat);
    }
    fsyncSync(fd);
    closeSync(fd);
    renameSync(tmp, target);
    return "atomic";
  } catch (err) {
    try {
      closeSync(fd);
    } catch {
      // already closed
    }
    try {
      unlinkSync(tmp);
    } catch {
      // never created or already renamed
    }
    throw err;
  }
}

/** Under sudo a new temp file belongs to root, give it back to the original owner. */
function keepOwner(fd: number, stat: Stats) {
  try {
    fchownSync(fd, stat.uid, stat.gid);
  } catch {
    // not root and not the owner: the file keeps our uid, same as any editor would
  }
}

function isPermissionError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code;
  return code === "EACCES" || code === "EPERM" || code === "EROFS";
}
