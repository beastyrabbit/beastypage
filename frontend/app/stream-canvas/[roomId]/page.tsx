"use client";

import { useConvexAuth } from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CanvasEditor } from "@/components/stream-canvas/CanvasEditor";
import { getAccessibleRooms } from "@/lib/stream-canvas/api";

export default function StreamCanvasRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { isAuthenticated } = useConvexAuth();
  const { getToken } = useAuth();
  const [twitchChannel, setTwitchChannel] = useState<string | null>(null);

  // Fetch this room's Twitch channel from the accessible rooms list
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    getAccessibleRooms(getToken)
      .then((rooms) => {
        const room = rooms.find((r) => r.id === roomId);
        if (!cancelled && room) setTwitchChannel(room.twitchChannel);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, getToken, roomId]);

  return (
    <div className="fixed inset-0 overflow-hidden">
      <CanvasEditor roomId={roomId} twitchChannel={twitchChannel} />
    </div>
  );
}
