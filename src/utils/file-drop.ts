type FileWithPath = File & {
  path?: string;
};

export function extractDroppedFilePaths(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.files)
    .map((file) => {
      const withPath = file as FileWithPath;
      return withPath.path?.trim() ?? "";
    })
    .filter(Boolean);
}

export function mergeMultilineItems(existingText: string, nextItems: string[]) {
  const merged = new Set(
    existingText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
  );

  for (const item of nextItems) {
    if (item.trim()) {
      merged.add(item.trim());
    }
  }

  return Array.from(merged).join("\n");
}
