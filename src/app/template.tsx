/** Soft fade between pages (opacity only, so sticky and fixed children keep working). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
