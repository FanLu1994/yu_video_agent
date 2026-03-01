import "@/app";

window.addEventListener("error", (event) => {
  console.error("[renderer-error]", {
    error: event.error,
    filename: event.filename,
    line: event.lineno,
    message: event.message,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[renderer-unhandledrejection]", {
    reason: event.reason,
  });
});
