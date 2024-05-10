type Rgb = { r: number; g: number; b: number };

export class LogColorWrapper {
  private colorPointer = 0;
  private colorMap: { [s: string]: string } = {};
  private colors = [
    { r: 42, g: 157, b: 143 },
    { r: 233, g: 196, b: 106 },
    { r: 244, g: 162, b: 97 },
    { r: 231, g: 111, b: 81 },
    { r: 29, g: 53, b: 87 },
    { r: 69, g: 123, b: 157 },
    { r: 168, g: 218, b: 220 },
    { r: 230, g: 57, b: 70 },
    { r: 205, g: 180, b: 219 },
    { r: 255, g: 200, b: 221 },
    { r: 255, g: 175, b: 204 },
    { r: 189, g: 224, b: 254 },
    { r: 162, g: 210, b: 255 },
    { r: 255, g: 205, b: 178 },
    { r: 255, g: 180, b: 162 },
    { r: 229, g: 152, b: 155 },
    { r: 181, g: 131, b: 141 },
    { r: 214, g: 40, b: 40 },
    { r: 247, g: 127, b: 0 },
    { r: 252, g: 191, b: 73 },
    { r: 234, g: 226, b: 183 },
    { r: 246, g: 189, b: 96 },
    { r: 245, g: 202, b: 195 },
    { r: 132, g: 165, b: 157 },
    { r: 242, g: 132, b: 130 },
    { r: 155, g: 93, b: 229 },
    { r: 241, g: 91, b: 181 },
    { r: 254, g: 228, b: 64 },
    { r: 0, g: 187, b: 249 },
    { r: 0, g: 245, b: 212 },
    { r: 111, g: 29, b: 27 },
    { r: 187, g: 148, b: 87 },
    { r: 153, g: 88, b: 42 },
    { r: 79, g: 119, b: 45 },
    { r: 144, g: 169, b: 85 },
    { r: 236, g: 243, b: 158 },
    { r: 22, g: 105, b: 122 },
    { r: 72, g: 159, b: 181 },
    { r: 130, g: 192, b: 204 },
    { r: 255, g: 166, b: 43 },
    { r: 254, g: 147, b: 140 },
    { r: 230, g: 184, b: 156 },
    { r: 234, g: 210, b: 172 },
    { r: 156, g: 175, b: 183 },
    { r: 66, g: 129, b: 164 },
  ];

  color(s: string, rgb?: Rgb) {
    if (!this.colorMap[s]) {
      this.colorMap[s] = rgb ? this.encode(s, rgb) : this.getNextColor(s);
    }

    return this.colorMap[s];
  }

  private getNextColor(s: string) {
    const rgb = this.colors[this.colorPointer];
    if (this.colorPointer == this.colors.length - 1) {
      this.colorPointer = 0;
    } else {
      this.colorPointer++;
    }

    return this.encode(s, rgb);
  }

  private encode(s: string, { r, g, b }: Rgb) {
    return `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`;
  }
}
