export class StringUtil {
  /** likeThisOne -> Like this one */
  static humanizeCamel(s: string) {
    // Add space before each uppercase letter and trim the resulting string
    const spacedStr = s.replace(/([A-Z])/g, ' $1').trim();
    // Capitalize the first letter and append the rest of the string
    return spacedStr.charAt(0).toUpperCase() + spacedStr.slice(1).toLowerCase();
  }
}
