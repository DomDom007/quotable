// Quotable: finds lines in old writing that stand alone as posts, then schedules them on a slow rotation.
import { useMemo, useState } from "react";
import { downloadIcs, localDate } from "./lib/ics";
import { download, uid, useCopy, useStored } from "./lib/store";
import { addDays, prettyDate, todayISO } from "./lib/time";
import { Section, Stat, Stats } from "./ui/kit";

const T = "quotable";
type Essay = { id: string; title: string; url: string; text: string };
type Pick = { id: string; text: string; from: string; url: string };

const SAMPLE: Essay[] = [{
  id: "e1", title: "What a year of weekly writing taught me", url: "https://example.com/weekly-writing",
  text: `When I started this newsletter I thought the hard part would be finding ideas. It was not. The hard part was showing up on the weeks when nothing felt worth saying.
Most weeks, the essay I almost did not send got the most replies. People can tell when you are working something out instead of performing it.
I stopped writing for the algorithm in March. My open rate went down for two months and then went higher than it had ever been.
A draft you publish teaches you more than ten drafts you polish. Readers are generous with rough edges and unforgiving with boredom.
Also, a small note: next week is a holiday, so the issue will arrive on Tuesday.
If you write every week for a year, you will not become famous. You will become someone who can think in public, which is rarer.`,
}];

function sentences(text: string) {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/).map(s => s.trim()).filter(Boolean);
}
function standalone(s: string): [number, string[]] {
  const why: string[] = []; let sc = 0;
  const len = s.length;
  if (len >= 50 && len <= 220) { sc += 3; why.push("post length"); } else if (len > 280) sc -= 4;
  if (/^(it|this|that|they|these|those|he|she|also|and|but|so|then)\b/i.test(s)) { sc -= 4; why.push("needs context"); }
  if (/\b(you|your)\b/i.test(s)) { sc += 1.5; why.push("speaks to the reader"); }
  if (/\b(never|always|most|every|nobody|rarer|more than|less than|the hard part|the secret)\b/i.test(s)) { sc += 2.5; why.push("clear claim"); }
  if (/\d/.test(s)) { sc += 1; why.push("specific"); }
  if (/\b(next week|this issue|newsletter|subscribe|holiday|note:)\b/i.test(s)) { sc -= 5; why.push("dated"); }
  return [sc, why];
}

export default function Quotable() {
  const [essays, setEssays] = useStored<Essay[]>(T, "essays", SAMPLE);
  const [picks, setPicks] = useStored<Pick[]>(T, "picks", []);
  const [every, setEvery] = useStored(T, "every", 3);
  const [start, setStart] = useStored(T, "start", todayISO());
  const [draft, setDraft] = useState({ title: "", url: "", text: "" });
  const { copy, copied } = useCopy();

  const candidates = useMemo(() => essays.flatMap(e => sentences(e.text).map(s => { const [score, why] = standalone(s); return { text: s, score, why, from: e.title, url: e.url }; }))
    .filter(c => c.score > 2 && !picks.some(p => p.text === c.text)).sort((a, b) => b.score - a.score), [essays, picks]);

  const schedule = picks.map((p, i) => ({ ...p, date: addDays(start, i * every) }));
  const post = (p: Pick) => `${p.text}${p.url ? `\n\nFrom: ${p.from} ${p.url}` : ""}`;

  return (
    <div className="stack">
      <div className="grid2">
        <Section title="Your archive" aside={<span className="pill">{essays.length} pieces</span>}>
          <form className="stack" style={{ gap: 10 }} onSubmit={e => { e.preventDefault(); if (!draft.text.trim()) return; setEssays([...essays, { id: uid(), ...draft, title: draft.title || "Untitled" }]); setDraft({ title: "", url: "", text: "" }); }}>
            <div className="row">
              <label className="field"><span>Title</span><input id="qt-title" className="input" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
              <label className="field"><span>Link (optional)</span><input id="qt-url" className="input" value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} /></label>
            </div>
            <label className="field"><span>Paste the full text</span><textarea id="qt-text" className="input" rows={5} value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })} /></label>
            <button className="btn small primary" type="submit" style={{ alignSelf: "flex-start" }}>Add to archive</button>
          </form>
          <div className="stack" style={{ gap: 6, marginTop: 14 }}>
            {essays.map(e => (
              <div key={e.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <span>{e.title} <span className="note">{sentences(e.text).length} sentences</span></span>
                <button className="btn ghost small danger" onClick={() => setEssays(essays.filter(x => x.id !== e.id))}>Remove</button>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Lines that stand alone" aside={<span className="pill">{candidates.length} found</span>}>
          <div className="stack" style={{ gap: 10, maxHeight: 520, overflow: "auto" }}>
            {candidates.length === 0 && <p className="empty-note">Add essays to find quotable lines.</p>}
            {candidates.map((c, i) => (
              <div key={i} className="qt-cand">
                <p>“{c.text}”</p>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                  <div className="row" style={{ gap: 6 }}>{c.why.filter(w => w !== "needs context").map(w => <span key={w} className="pill">{w}</span>)}</div>
                  <button className="btn small" onClick={() => setPicks([...picks, { id: uid(), text: c.text, from: c.from, url: c.url }])}>Add to rotation</button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title="Rotation" aside={<>
        <button className="btn small" disabled={!schedule.length} onClick={() => downloadIcs("quotable.ics", schedule.map(s => ({ title: `Post: ${s.text.slice(0, 50)}…`, start: localDate(s.date, "09:00"), description: post(s), alarmMinutes: 0 })), "Quotable posts")}>Calendar reminders</button>
        <button className="btn small" disabled={!schedule.length} onClick={() => download("quotable.csv", ["Date,Post", ...schedule.map(s => `${s.date},"${post(s).replace(/"/g, '""')}"`)].join("\n"), "text/csv")}>Export CSV</button>
      </>}>
        <div className="row" style={{ marginBottom: 14 }}>
          <label className="field" style={{ flex: "0 0 160px" }}><span>Post every</span><select id="qt-every" className="input" value={every} onChange={e => setEvery(+e.target.value)}>{[1, 2, 3, 4, 7].map(n => <option key={n} value={n}>{n === 1 ? "day" : n === 7 ? "week" : `${n} days`}</option>)}</select></label>
          <label className="field" style={{ flex: "0 0 180px" }}><span>Starting</span><input id="qt-start" type="date" className="input" value={start} onChange={e => setStart(e.target.value)} /></label>
          <Stats><Stat value={schedule.length} label="Posts queued" /><Stat value={schedule.length ? prettyDate(schedule[schedule.length - 1].date) : "None"} label="Queue runs until" /></Stats>
        </div>
        {schedule.length === 0 ? <p className="empty-note">Pick lines above to fill your rotation.</p> : (
          <div className="table-wrap"><table className="t"><tbody>
            {schedule.map((s, i) => (
              <tr key={s.id}>
                <td className="num" style={{ whiteSpace: "nowrap" }}>{prettyDate(s.date)}</td>
                <td>{s.text}<br /><span className="note">{s.from}</span></td>
                <td className="r" style={{ whiteSpace: "nowrap" }}>
                  <button className="btn ghost small" onClick={() => copy(post(s))}>{copied ? "Copied" : "Copy"}</button>
                  <button className="btn ghost small" disabled={i === 0} onClick={() => { const n = [...picks]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setPicks(n); }}>Up</button>
                  <button className="btn ghost small danger" onClick={() => setPicks(picks.filter(p => p.id !== s.id))}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </Section>
      <style>{`.qt-cand{padding:12px;border-radius:10px;background:var(--sunk)}.qt-cand p{font-family:var(--serif);font-size:18px;line-height:1.35}`}</style>
    </div>
  );
}
