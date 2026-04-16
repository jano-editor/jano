import { exec as execCb } from "node:child_process";
import { dirname, basename } from "node:path";
import { log } from "./utils/logger.ts";

export interface GitInfo {
  branch: string;
  worktree?: string;
}

function git(args: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execCb(`git ${args}`, { cwd, encoding: "utf8", timeout: 3000 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

async function isInsideWorkTree(cwd: string): Promise<boolean> {
  return (await git("rev-parse --is-inside-work-tree", cwd)) === "true";
}

async function getBranch(cwd: string): Promise<string> {
  return git("rev-parse --abbrev-ref HEAD", cwd);
}

async function getToplevel(cwd: string): Promise<string> {
  return git("rev-parse --show-toplevel", cwd);
}

function parseMainWorktreePath(porcelain: string): string | undefined {
  const firstEntry = porcelain.split("\n\n")[0];
  const worktreeLine = firstEntry.split("\n").find((l) => l.startsWith("worktree "));
  return worktreeLine?.slice("worktree ".length);
}

async function detectWorktree(cwd: string, toplevel: string): Promise<string | undefined> {
  try {
    const raw = await git("worktree list --porcelain", cwd);
    const mainRoot = parseMainWorktreePath(raw);
    if (mainRoot && toplevel !== mainRoot) {
      return basename(toplevel);
    }
  } catch {
    // worktree detection is optional
  }
}

export async function getGitInfo(filePath?: string): Promise<GitInfo | null> {
  const cwd = filePath ? dirname(filePath) : process.cwd();
  try {
    if (!(await isInsideWorkTree(cwd))) return null;
    const branch = await getBranch(cwd);
    const toplevel = await getToplevel(cwd);
    const worktree = await detectWorktree(cwd, toplevel);
    log.debug({ action: "git_info", branch, worktree: worktree ?? null });
    return { branch, worktree };
  } catch (err) {
    log.debug({
      action: "git_info_unavailable",
      reason: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
