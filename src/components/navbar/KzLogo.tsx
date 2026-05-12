import { type Component, createUniqueId } from 'solid-js';

interface KzLogoProps {
  class?: string;
  size?: number;
  'aria-hidden'?: boolean | 'true' | 'false';
}

export const KzLogo: Component<KzLogoProps> = (props) => {
  const id = createUniqueId();
  const clipB = `${id}-b`;
  const clipC = `${id}-c`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="199.0353 205.841 471.8496 449.075"
      width={props.size ?? 32}
      height={props.size ?? 32}
      aria-hidden={props['aria-hidden']}
      class={props.class}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 127.267 126.507"
        width="288"
        height="288"
        //@ts-expect-error
        transform="matrix(2.262959006398843,0,0,2.262959006398843,112.6630554199219,104.54794129739156)"
      >
        <defs>
          <clipPath id={clipB} clipPathUnits="userSpaceOnUse">
            <path d="M 0,94.88 H 95.45 V 0 H 0 Z" transform="translate(-81.53 -78.24)" />
          </clipPath>
          <clipPath id={clipC} clipPathUnits="userSpaceOnUse">
            <path d="M 0,94.88 H 95.45 V 0 H 0 Z" transform="translate(-13.96 -80.33)" />
          </clipPath>
        </defs>
        <path
          fill="currentColor"
          d="m 0,0 -25.32,-22.76 c -0.29,-0.26 -0.29,-0.71 0,-0.97 l 25.13,-23.23 c 0.13,-0.12 0.21,-0.3 0.21,-0.48 v -14.78 c 0,-0.56 -0.66,-0.86 -1.09,-0.49 l -33.05,29.08 c -0.09,0.08 -0.2,0.12 -0.32,0.13 -0.3,0.02 -0.56,-0.22 -0.56,-0.52 l -0.29,-21.32 c 0,-0.56 -0.66,-0.85 -1.08,-0.49 -4.23,3.64 -8.61,7.15 -12.56,11.06 -0.13,0.12 -0.2,0.3 -0.2,0.47 v 18.02 c 0,0.19 0.09,0.37 0.23,0.5 l 31.22,26.77 c 0.12,0.1 0.27,0.16 0.43,0.16 h 16.82 c 0.6,0 0.88,-0.74 0.44,-1.14 z"
          clip-path={`url(#${clipB})`}
          transform="matrix(1.33333 0 0 -1.33333 108.707 22.187)"
        />
        <path
          fill="currentColor"
          d="m 0,0 h 11.58 c 0.723,0 1.31,-0.587 1.31,-1.31 v -63.15 c 0,-0.724 -0.587,-1.31 -1.31,-1.31 H 0 c -0.723,0 -1.31,0.586 -1.31,1.31 V -1.31 C -1.31,-0.587 -0.723,0 0,0"
          clip-path={`url(#${clipC})`}
          transform="matrix(1.33333 0 0 -1.33333 18.613 19.4)"
        />
      </svg>
    </svg>
  );
};
