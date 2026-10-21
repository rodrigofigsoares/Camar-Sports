import type { Sport } from '../domain/model';

/** Decorative court markings, selected by the competition's sport. */
export function SportCourt({ sport }: { sport: Sport }) {
  const basketball = sport === 'basketball' || sport === 'basketball3x3';
  const half = sport === 'basketball3x3';
  const goalCourt = sport === 'handball' || sport === 'futsal';
  return (
    <svg className="sport-court" viewBox={half ? '0 0 120 140' : '0 0 240 140'} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <rect x="10" y="10" width={half ? 105 : 220} height="120" />
      {!half && sport !== 'beachhandball' && <path d="M120 10V130" />}
      {sport === 'football' && <>
        <circle cx="120" cy="70" r="19" />
        <path d="M10 35H43V105H10 M230 35H197V105H230 M10 52H22V88H10 M230 52H218V88H230 M43 55Q58 70 43 85 M197 55Q182 70 197 85" />
        <circle cx="32" cy="70" r="1" /><circle cx="208" cy="70" r="1" />
      </>}
      {goalCourt && <>
        <path d="M10 27A36 36 0 0 1 46 63V77A36 36 0 0 1 10 113 M230 27A36 36 0 0 0 194 63V77A36 36 0 0 0 230 113" />
        {sport === 'handball' ? <>
          <path strokeDasharray="4 4" d="M10 16A49 49 0 0 1 59 65V75A49 49 0 0 1 10 124 M230 16A49 49 0 0 0 181 65V75A49 49 0 0 0 230 124" />
          <path d="M52 66V74 M188 66V74" />
        </> : <circle cx="120" cy="70" r="18" />}
      </>}
      {(goalCourt || sport === 'football' || sport === 'beachhandball') && <path d="M10 61H4V79H10 M230 61H236V79H230" />}
      {sport === 'beachhandball' && <path d="M49 10V130 M191 10V130" />}
      {basketball && <>
        {!half && <circle cx="120" cy="70" r="17" />}
        <path d="M10 47H49V93H10 M20 59V81 M23 70h5 M10 21H24A53 53 0 0 1 24 119H10" />
        <circle cx="29" cy="70" r="4" /><circle cx="49" cy="70" r="17" />
        {!half && <g transform="translate(240 0) scale(-1 1)"><path d="M10 47H49V93H10 M20 59V81 M23 70h5 M10 21H24A53 53 0 0 1 24 119H10" /><circle cx="29" cy="70" r="4" /><circle cx="49" cy="70" r="17" /></g>}
      </>}
      {sport === 'volleyball' && <><path d="M83 10V130 M157 10V130" /><path strokeDasharray="2 3" d="M120 4V136" /></>}
      {sport === 'tennis' && <><path d="M10 25H230 M10 115H230 M64 25V115 M176 25V115 M64 70H176" /><path strokeDasharray="2 3" d="M120 4V136" /></>}
      {sport === 'beachtennis' && <path strokeDasharray="2 3" d="M120 4V136" />}
    </svg>
  );
}
