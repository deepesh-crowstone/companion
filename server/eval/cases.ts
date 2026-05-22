import { readdir, readFile } from "fs/promises";
import path from "path";
import type { EvalCase, EvalCaseFile } from "./types.js";

export const DEFAULT_CASE_DIR = path.join(process.cwd(), "eval", "cases");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateCase(value: unknown, source: string): EvalCase {
  if (!isRecord(value)) {
    throw new Error(`Invalid eval case in ${source}: expected object`);
  }
  const id = value.id;
  const title = value.title;
  const channel = value.channel;
  const tags = value.tags;
  const goals = value.goals;
  const history = value.history;

  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`Invalid eval case in ${source}: missing string id`);
  }
  if (typeof title !== "string" || title.length === 0) {
    throw new Error(`Invalid eval case ${id}: missing string title`);
  }
  if (
    channel !== "text" &&
    channel !== "voice" &&
    channel !== "text_tagged_voice"
  ) {
    throw new Error(`Invalid eval case ${id}: unsupported channel`);
  }
  if (!Array.isArray(tags) || !tags.every((v) => typeof v === "string")) {
    throw new Error(`Invalid eval case ${id}: tags must be strings`);
  }
  if (!Array.isArray(goals) || !goals.every((v) => typeof v === "string")) {
    throw new Error(`Invalid eval case ${id}: goals must be strings`);
  }
  if (
    !Array.isArray(history) ||
    history.length === 0 ||
    !history.every(
      (msg) =>
        isRecord(msg) &&
        (msg.role === "user" || msg.role === "assistant") &&
        typeof msg.content === "string",
    )
  ) {
    throw new Error(`Invalid eval case ${id}: history is invalid`);
  }
  const last = history[history.length - 1] as { role: unknown };
  if (last.role !== "user") {
    throw new Error(`Invalid eval case ${id}: history must end with user`);
  }

  return value as EvalCase;
}

function validateCaseFile(value: unknown, source: string): EvalCase[] {
  if (!isRecord(value) || !Array.isArray(value.cases)) {
    throw new Error(`Invalid eval case file ${source}: expected { cases: [] }`);
  }
  return (value as EvalCaseFile).cases.map((item) => validateCase(item, source));
}

export async function loadEvalCases(caseDir = DEFAULT_CASE_DIR): Promise<EvalCase[]> {
  const entries = await readdir(caseDir, { withFileTypes: true });
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(caseDir, entry.name))
    .sort();

  if (jsonFiles.length === 0) {
    throw new Error(`No eval case JSON files found in ${caseDir}`);
  }

  const allCases: EvalCase[] = [];
  for (const file of jsonFiles) {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    allCases.push(...validateCaseFile(parsed, file));
  }

  const seen = new Set<string>();
  for (const evalCase of allCases) {
    if (seen.has(evalCase.id)) {
      throw new Error(`Duplicate eval case id: ${evalCase.id}`);
    }
    seen.add(evalCase.id);
  }

  return allCases;
}
