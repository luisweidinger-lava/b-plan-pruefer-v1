// Page header with title, subtitle, and data source attribution

export function Header() {
  return (
    <header className="text-center mb-10">
      <div className="inline-flex items-center gap-2 mb-4">
        {/* Small brand accent dot */}
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: "#D48463" }}
        />
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "#3E6259" }}
        >
          Planeco Building
        </span>
      </div>

      <h1
        className="text-4xl font-bold mb-3 leading-tight"
        style={{ color: "#1F2D2A" }}
      >
        B-Plan Prüfer
      </h1>

      <p className="text-base max-w-md mx-auto leading-relaxed" style={{ color: "#3E6259" }}>
        Gib eine Adresse ein und prüfe, ob das Grundstück im Geltungsbereich
        eines Bebauungsplans liegt.
      </p>

      {/* Data source note */}
      <p className="text-xs mt-3" style={{ color: "#3E6259", opacity: 0.7 }}>
        Datenquelle: LGV Hamburg · Geoportal Berlin · Aktuell Hamburg und Berlin verfügbar
      </p>
    </header>
  );
}
