import type { Strings } from "./i18n";
import type { EventRepository } from "./repository";

export interface ImportOutcome { message: string; problems?: string[]; error?: boolean }

/** Read a chosen .json backup and import it through the repository (shared by Settings and the calendars panel). */
export async function importFromFile(repo: EventRepository, file: File, t: Strings, after: () => Promise<void> | void): Promise<ImportOutcome> {
  let data: unknown;
  try { data = JSON.parse(await file.text()); } catch { return { message: t.importBadFile, error: true }; }
  try {
    const r = await repo.importBackup(data);
    await after();
    return { message: t.importDone(r.added, r.skipped, r.calendarsCreated), problems: r.errors };
  } catch (e) {
    const msg = (e as Error).message;
    return { message: /not an Ittim backup|Unrecognised/.test(msg) ? t.importBadFile : msg, error: true };
  }
}
