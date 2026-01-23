import { ClockitSessionUpload } from "@/types";

export const toDateKey = (iso: string) => iso.slice(0, 10);

export const formatDayLabel = (isoKey: string) => {
  const d = new Date(isoKey);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", weekday: "short" }).format(d);
};

export const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};
export const camelCaseToSentence = (str: string) => {
  return str
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (firstChar) => firstChar.toUpperCase());
}
export const createCSVFromSessionUpload = (session: ClockitSessionUpload): string | null => {
          const csvHeader = Object.keys(session).map(camelCaseToSentence).join(",") + "\n";
          const csvRow = Object.values(session)
            .map((value) => {
              const str = value === null || value === undefined ? "" : String(value);
              return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
            })
            .join(",") + ",, " + "\n";
          return csvHeader + csvRow;

}

export const downloadSessionCsv = (session: ClockitSessionUpload) => {
  if (!session.endedAt) {return;}
  if(!session.csv) {return;}
  const startedIso = new Date(session.startedAt).toISOString();

  const blob = new Blob([session.csv ?? ""], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `clockit-session-${toDateKey(startedIso)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};
