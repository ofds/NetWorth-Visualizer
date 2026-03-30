type Props = { text: string }

/** Native `title` avoids clipped popovers when panels use overflow:hidden (no page scroll). */
export function FieldHint({ text }: Props) {
  return (
    <span
      title={text}
      className="ml-0.5 inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-slate-600 text-[9px] font-medium text-slate-500 hover:border-teal-500/40 hover:text-teal-300"
    >
      ?
    </span>
  )
}
