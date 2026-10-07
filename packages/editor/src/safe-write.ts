import {
  accessSync,
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fchownSync,
  fsyncSync,
  lstatSync,
  openSync,
  readlinkSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
  type Stats,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

/**
 * How the file was written:
 * - "atomic": temp file + rename, the file is either fully old or fully new
 * - "direct": written in place (hard links, files we can't hand back to their owner,
 *   or a folder we can't create files in)
 */
export type WriteMode = "atomic" | "direct";

/**
 * Writes a file without ever leaving it half written. Keeps permissions and owner,
 * writes through symlinks instead of replacing them, and keeps hard links intact.
 */
export function writeFileSafely(filePath: string, content: string): WriteMode {
  const target = resolveTarget(filePath);
  const stat = existsSync(target) ? statSync(target) : null;

  // a rename only needs folder permissions, so check the file itself:
  // a read-only file stays protected (throws EACCES like a plain write would)
  if (stat) accessSync(target, constants.W_OK);

  // in place: a rename would split hard links, or hand the file to us instead of its owner
  if (stat && (stat.nlink > 1 || !canKeepOwner(stat))) {
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

  let closed = false;
  try {
    writeSync(fd, content, null, "utf8");
    if (stat) {
      // owner first: chown clears setuid/setgid, the chmod below puts them back
      fchownSync(fd, stat.uid, stat.gid);
      // the mode passed to open is filtered by the umask, set it explicitly
      fchmodSync(fd, stat.mode & 0o7777);
    }
    fsyncSync(fd);
    closeSync(fd);
    closed = true;
    renameSync(tmp, target);
    return "atomic";
  } catch (err) {
    // only close once: the fd number may already belong to someone else
    if (!closed) {
      try {
        closeSync(fd);
      } catch {
        // already closed
      }
    }
    try {
      unlinkSync(tmp);
    } catch {
      // never created or already renamed
    }
    throw err;
  }
}

/**
 * Whether a new file can get the same owner and group as `stat`. Without root we can only
 * create files owned by ourselves, with a group we belong to.
 */
export function canKeepOwner(
  stat: Pick<Stats, "uid" | "gid">,
  self: { uid: number | undefined; groups: number[] } = currentUser(),
): boolean {
  if (self.uid === undefined) return true; // windows: no unix owners to keep
  if (self.uid === 0) return true;
  return stat.uid === self.uid && self.groups.includes(stat.gid);
}

function currentUser() {
  return {
    uid: process.geteuid?.(),
    // the primary group isn't always part of getgroups()
    groups: [...(process.getgroups?.() ?? []), process.getegid?.() ?? -1],
  };
}

/** Follows symlinks, also dangling ones, so saving creates the link's target instead of replacing the link. */
function resolveTarget(filePath: string, depth = 0): string {
  try {
    return realpathSync(filePath);
  } catch {
    // doesn't exist (yet), or a dangling / looping link
  }
  let link: Stats;
  try {
    link = lstatSync(filePath);
  } catch {
    return filePath; // a plain new file
  }
  if (!link.isSymbolicLink()) return filePath;
  if (depth > 40) throw new Error(`Too many symbolic links: ${filePath}`);
  return resolveTarget(resolve(dirname(filePath), readlinkSync(filePath)), depth + 1);
}

function isPermissionError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code;
  return code === "EACCES" || code === "EPERM" || code === "EROFS";
}
