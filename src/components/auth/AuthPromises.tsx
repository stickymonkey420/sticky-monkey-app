// Trust promises shown on Sign in / Sign up. Keep these in sync with the
// privacy policy -- they are public commitments.
const PROMISES = [
  { icon: "🔒", title: "We will never sell your data.", body: "Not to advertisers, data brokers, or anyone else." },
  { icon: "🚫", title: "No ads. Ever.", body: "You'll never be made to look at ads or third-party marketing." },
];

export default function AuthPromises() {
  return (
    <div className="mt-5 rounded-xl border border-[#3ddc97]/25 bg-[#3ddc97]/5 p-3.5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#3ddc97]">The Sticky Monkey promise</div>
      <ul className="flex flex-col gap-2">
        {PROMISES.map((p) => (
          <li key={p.title} className="flex gap-2.5 text-xs">
            <span aria-hidden className="text-sm leading-none">
              {p.icon}
            </span>
            <span>
              <span className="font-semibold text-text-primary">{p.title}</span>{" "}
              <span className="text-text-muted">{p.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
