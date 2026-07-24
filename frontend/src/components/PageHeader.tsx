interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 24,
        marginBottom: 32,
        paddingBottom: 24,
        borderBottom: "1px solid var(--seam)",
      }}
    >
      <div>
        <h1
          style={{
            fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif",
            fontWeight: 600,
            fontSize: 24,
            color: "var(--slate)",
            margin: 0,
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              margin: "4px 0 0",
              fontFamily: "'IBM Plex Sans', ui-sans-serif, sans-serif",
              fontSize: 13,
              fontWeight: 300,
              color: "var(--slate-muted)",
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}
