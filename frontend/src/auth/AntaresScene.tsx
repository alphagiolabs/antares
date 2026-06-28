interface AntaresSceneProps {
  reducedMotion: boolean;
}

export default function AntaresScene({ reducedMotion }: AntaresSceneProps) {
  return (
    <div className="at-scene-shell" aria-hidden="true">
      <div className="at-scene-shell__gradient" />
      {reducedMotion ? (
        <img
          className="at-scene-shell__poster"
          src="./sign-up-image.webp"
          alt=""
          draggable={false}
        />
      ) : (
        <video
          className="at-scene-shell__video"
          autoPlay
          loop
          muted
          playsInline
          poster="./sign-up-image.webp"
          preload="metadata"
          aria-hidden="true"
        >
          <source src="./sign-up-video.mp4" type="video/mp4" />
        </video>
      )}
    </div>
  );
}
