import { useNavigate } from "react-router-dom";
import { Map, ExternalLink } from "lucide-react";

export function MiniMapWidget() {
  const navigate = useNavigate();

  return (
    <div className="card h-full flex flex-col">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 stat-icon-purple rounded-lg">
            <Map className="w-5 h-5" />
          </div>
          <h3 className="font-semibold text-foreground">Electorate Map</h3>
        </div>
        <button
          onClick={() => navigate("/war-room")}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
        >
          Open Campaign HQ
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 relative bg-secondary/50 flex items-center justify-center">
        <div className="text-center p-8">
          <Map className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground text-sm mb-4">
            View your electorate distribution
          </p>
          <button
            onClick={() => navigate("/war-room")}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Open Full Map
          </button>
        </div>
      </div>
    </div>
  );
}
