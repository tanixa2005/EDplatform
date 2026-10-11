/**
 * A one-hop handoff for a photo picked on the home screen.
 *
 * Starting a session is a JSON request; the photo belongs to the first *turn*,
 * which happens after the router navigates to /tutor/<id>. A File cannot travel
 * in a URL, and deliberately is not written to sessionStorage or IndexedDB -
 * the whole point of this MVP is that a child's photo is never stored anywhere.
 *
 * So it waits here, in memory, for exactly one read. A page reload loses it,
 * which is correct: the image was never saved, and the conversation should say
 * so rather than silently re-sending it.
 */
let pending: File | null = null;

export function setPendingImage(file: File | null): void {
  pending = file;
}

/** Returns the pending photo and clears it, so it can never be sent twice. */
export function takePendingImage(): File | null {
  const file = pending;
  pending = null;
  return file;
}
