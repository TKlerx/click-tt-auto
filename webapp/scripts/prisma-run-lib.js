function computeExitCode(result) {
  if (result.error) {
    return 1;
  }

  if (typeof result.status === "number") {
    return result.status;
  }

  return 1;
}

module.exports = {
  computeExitCode,
};
