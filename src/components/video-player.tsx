import { Play, Square, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface VideoPlayerProps {
  className?: string;
  src: string | undefined;
}

export function VideoPlayer({ className, src }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    const handleEnded = () => {
      setIsPlaying(false);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const time = Number.parseFloat(event.target.value);
    video.currentTime = time;
    setCurrentTime(time);
  };

  const formatTime = (time: number) => {
    if (!Number.isFinite(time) || time < 0) {
      return "0:00";
    }

    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const videoSrc = src
    ? src.startsWith("file://")
      ? src
      : `file:///${src.replace(/\\/g, "/")}`
    : undefined;

  if (!videoSrc) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-border/70 bg-muted/30 p-8 ${className ?? ""}`}
      >
        <p className="text-muted-foreground text-sm">视频文件不可用</p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      <div className="relative overflow-hidden rounded-lg border border-border/70 bg-black">
        <video
          className="w-full"
          onClick={togglePlay}
          ref={videoRef}
          src={videoSrc}
        >
          您的浏览器不支持视频播放
        </video>

        {!isPlaying && (
          <button
            className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors hover:bg-black/40"
            onClick={togglePlay}
            type="button"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg">
              <Play className="h-8 w-8 text-gray-900" />
            </div>
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={togglePlay} size="sm" variant="outline">
          {isPlaying ? (
            <>
              <Square className="h-4 w-4" />
              暂停
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              播放
            </>
          )}
        </Button>

        <Button onClick={toggleMute} size="sm" variant="ghost">
          {isMuted ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </Button>

        <input
          className="flex-1 cursor-pointer accent-primary"
          max={duration || 100}
          min={0}
          onChange={handleSeek}
          step={0.1}
          type="range"
          value={currentTime}
        />

        <span className="min-w-24 text-right font-mono text-muted-foreground text-xs">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
