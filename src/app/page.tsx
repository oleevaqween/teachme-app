import Link from "next/link";
import { BookOpen, Briefcase, FileText, Sparkles, Zap, type LucideIcon } from "lucide-react";

const destinations: {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  iconTint: string;
  iconColor: string;
  glow: string;
}[] = [
  {
    href: "/cv-studio",
    title: "CV Studio",
    description:
      "Tailor your CV to a job posting, write a checked cover letter and get interview questions for that application.",
    icon: FileText,
    iconTint: "from-rose-100 to-accent dark:from-rose-950",
    iconColor: "text-rose-600 dark:text-rose-400",
    glow: "shadow-rose-500/5 hover:shadow-rose-500/10 group-hover:from-rose-500/5 group-hover:to-primary/5",
  },
  {
    href: "/interview",
    title: "Interview",
    description: "Practise tough role-specific questions, get scored, and review your archived answers.",
    icon: Briefcase,
    iconTint: "from-accent to-primary/20",
    iconColor: "text-primary",
    glow: "shadow-primary/5 hover:shadow-primary/10 group-hover:from-primary/5 group-hover:to-rose-500/5",
  },
  {
    href: "/teach-me",
    title: "Teach Me",
    description: "Upload documents or pick a topic and learn in short lessons, with notes, flashcards and quick checks.",
    icon: BookOpen,
    iconTint: "from-accent to-primary/10",
    iconColor: "text-primary",
    glow: "shadow-primary/5 hover:shadow-primary/10 group-hover:from-primary/5 group-hover:to-accent/50",
  },
];

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-(--space-page-inline) py-16">
      {/* Animated background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="animate-orbit absolute left-[5%] top-[15%] h-44 w-44 rounded-full border border-primary/40 opacity-60" />
        <div className="animate-drift absolute right-[10%] top-[25%] h-32 w-32 rounded-2xl bg-primary/15 rotate-12" />
        <div className="animate-spin-slow absolute bottom-[15%] left-[15%] h-64 w-64 rounded-full border-2 border-dashed border-primary/25" />
        <div className="animate-orbit absolute right-[20%] bottom-[25%] h-20 w-20 rounded-full border border-primary/30 delay-500" style={{ animationDelay: "5s" }} />
        <div className="animate-float absolute left-[30%] bottom-[35%] h-3 w-3 rounded-full bg-primary/50" />
        <div className="animate-float-reverse absolute right-[35%] top-[40%] h-5 w-5 rounded-full bg-primary/30" />
        <div className="animate-float-slow absolute -right-32 -top-32 h-96 w-96 rounded-full bg-gradient-to-bl from-primary/15 to-transparent blur-2xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,color-mix(in_oklch,var(--primary)_4%,transparent)_1px,transparent_0)] bg-[size:40px_40px]" />
      </div>

      {/* Hero section */}
      <section className="relative z-10 mx-auto max-w-3xl text-center animate-fade-in-up">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-small font-medium text-primary">
          <Sparkles className="size-4" aria-hidden="true" />
          Your career and learning companion
        </div>

        <h1 className="text-h1 text-foreground sm:text-display">
          Apply smarter.
          <br />
          <span className="bg-gradient-to-r from-primary to-[color-mix(in_oklch,var(--primary),var(--foreground)_30%)] bg-clip-text text-transparent">
            Interview better.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-h3 leading-relaxed text-foreground-secondary">
          Tailor your CV and cover letter for each job, practise for the interview, and learn the
          topics that will help you land it.
        </p>
      </section>

      {/* Primary destinations */}
      <section className="relative z-10 mt-12 grid w-full max-w-5xl gap-6 md:grid-cols-3" aria-label="Get started">
        {destinations.map((item, index) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex flex-col items-center gap-4 rounded-2xl border border-border/60 bg-card/80 p-8 text-center shadow-lg backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 animate-fade-in-up ${item.glow}`}
              style={{ animationFillMode: "both", animationDelay: `${200 + index * 100}ms` }}
            >
              {/* Hover gradient overlay */}
              <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br from-transparent to-transparent transition-all duration-300 ${item.glow}`} />

              <div className={`relative flex size-16 items-center justify-center rounded-xl bg-gradient-to-br transition-transform duration-300 group-hover:scale-110 ${item.iconTint}`}>
                <Icon className={`size-8 ${item.iconColor}`} aria-hidden="true" />
              </div>
              <div className="relative">
                <h2 className="text-h3 leading-snug text-card-foreground">{item.title}</h2>
                <p className="mt-2 text-small text-foreground-secondary">{item.description}</p>
              </div>

              <div className="relative mt-auto flex items-center gap-1.5 text-small font-medium text-primary opacity-0 transition-all duration-300 group-hover:opacity-100">
                <span>Get started</span>
                <Zap className="size-4" aria-hidden="true" />
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
