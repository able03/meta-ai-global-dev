// Lets TSX use Google's <model-viewer> web component.

import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>
    }
  }
}
