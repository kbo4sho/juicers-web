// When the upcoming-order pile unmounts (one open ticket left) and it had
// focus, move keyboard focus to the remaining ticket button.
export function attachPileFocusRestore(button: HTMLElement) {
  let hadFocus = false;
  const onFocus = () => {
    hadFocus = true;
  };
  const onBlur = () => {
    // Keep the flag if this blur is the button leaving the document, so the
    // cleanup can move focus to the remaining ticket.
    if (button.isConnected) hadFocus = button.contains(document.activeElement);
  };
  button.addEventListener("focusin", onFocus);
  button.addEventListener("focusout", onBlur);
  return () => {
    button.removeEventListener("focusin", onFocus);
    button.removeEventListener("focusout", onBlur);
    if (!hadFocus) return;
    const select = button.closest(".order-station")?.querySelector<HTMLElement>(".order-card__select");
    select?.focus({ preventScroll: true });
  };
}
