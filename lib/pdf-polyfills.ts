/**
 * Server-Polyfills für pdfjs-dist in Serverless-Functions (Vercel).
 *
 * pdfjs-dist referenziert die Browser-APIs DOMMatrix und Path2D auf
 * MODULEBENE (`const SCALE_MATRIX = new DOMMatrix()`); in Node versucht es
 * beide über das optionale Paket «@napi-rs/canvas» zu polyfillen. Das
 * Paket fehlt im Vercel-Function-Bundle → die Function stirbt beim Laden
 * mit «ReferenceError: DOMMatrix is not defined».
 *
 * Für die reine Text-Extraktion (getTextContent) wird nie gerendert –
 * ein leichter Polyfill genügt. Existiert `globalThis.DOMMatrix` bereits
 * (Setzung hier VOR dem pdfjs-Import), überspringt pdfjs seinen
 * @napi-rs/canvas-Ladeversuch; lokal und auf Vercel läuft damit derselbe
 * Pfad. DOMMatrix ist funktional implementiert (2D-affin, Spec-konform
 * mutierende *Self- und nicht-mutierende Basis-Methoden), damit nichts
 * leise falsch rechnet; Path2D ist ein No-op-Sammler (nur Rendering).
 *
 * Nur aus Server-Code importieren (lib/ov-parse.ts, erster Import).
 * Die Parser-Unit-Tests laufen über denselben Polyfill-Pfad und sichern
 * die Extraktion (191/191 bzw. 162/162 Zeilen, rappengenaue Summen).
 */

type MatrixInit = number[] | ServerDOMMatrix | undefined;

class ServerDOMMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: MatrixInit) {
    if (init instanceof ServerDOMMatrix) {
      Object.assign(this, {
        a: init.a, b: init.b, c: init.c, d: init.d, e: init.e, f: init.f,
      });
    } else if (Array.isArray(init) && init.length === 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init;
    } else if (Array.isArray(init) && init.length === 16) {
      // 4×4 (m11 m12 … m44) auf die 2D-affinen Komponenten abbilden
      this.a = init[0];
      this.b = init[1];
      this.c = init[4];
      this.d = init[5];
      this.e = init[12];
      this.f = init[13];
    }
  }

  get is2D(): boolean {
    return true;
  }

  get isIdentity(): boolean {
    return (
      this.a === 1 && this.b === 0 && this.c === 0 &&
      this.d === 1 && this.e === 0 && this.f === 0
    );
  }

  /** this = this × other (Spec: multiplySelf) */
  multiplySelf(other: ServerDOMMatrix): this {
    return this.#assign(ServerDOMMatrix.#combine(this, other));
  }

  /** this = other × this (Spec: preMultiplySelf) */
  preMultiplySelf(other: ServerDOMMatrix): this {
    return this.#assign(ServerDOMMatrix.#combine(other, this));
  }

  multiply(other: ServerDOMMatrix): ServerDOMMatrix {
    return ServerDOMMatrix.#combine(this, other);
  }

  translate(tx = 0, ty = 0): ServerDOMMatrix {
    return this.multiply(new ServerDOMMatrix([1, 0, 0, 1, tx, ty]));
  }

  translateSelf(tx = 0, ty = 0): this {
    return this.multiplySelf(new ServerDOMMatrix([1, 0, 0, 1, tx, ty]));
  }

  scale(sx = 1, sy = sx): ServerDOMMatrix {
    return this.multiply(new ServerDOMMatrix([sx, 0, 0, sy, 0, 0]));
  }

  scaleSelf(sx = 1, sy = sx): this {
    return this.multiplySelf(new ServerDOMMatrix([sx, 0, 0, sy, 0, 0]));
  }

  invertSelf(): this {
    const det = this.a * this.d - this.b * this.c;
    if (det === 0 || !Number.isFinite(det)) {
      return this.#assign(
        new ServerDOMMatrix([NaN, NaN, NaN, NaN, NaN, NaN]),
      );
    }
    return this.#assign(
      new ServerDOMMatrix([
        this.d / det,
        -this.b / det,
        -this.c / det,
        this.a / det,
        (this.c * this.f - this.d * this.e) / det,
        (this.b * this.e - this.a * this.f) / det,
      ]),
    );
  }

  inverse(): ServerDOMMatrix {
    return new ServerDOMMatrix(this).invertSelf();
  }

  transformPoint(point: { x?: number; y?: number } = {}): {
    x: number;
    y: number;
    z: number;
    w: number;
  } {
    const x = point.x ?? 0;
    const y = point.y ?? 0;
    return {
      x: this.a * x + this.c * y + this.e,
      y: this.b * x + this.d * y + this.f,
      z: 0,
      w: 1,
    };
  }

  static #combine(m1: ServerDOMMatrix, m2: ServerDOMMatrix): ServerDOMMatrix {
    return new ServerDOMMatrix([
      m1.a * m2.a + m1.c * m2.b,
      m1.b * m2.a + m1.d * m2.b,
      m1.a * m2.c + m1.c * m2.d,
      m1.b * m2.c + m1.d * m2.d,
      m1.a * m2.e + m1.c * m2.f + m1.e,
      m1.b * m2.e + m1.d * m2.f + m1.f,
    ]);
  }

  #assign(source: ServerDOMMatrix): this {
    Object.assign(this, {
      a: source.a, b: source.b, c: source.c,
      d: source.d, e: source.e, f: source.f,
    });
    return this;
  }
}

/** Nur fürs (nie genutzte) Rendering referenziert – No-op-Sammler */
class ServerPath2D {
  addPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  closePath(): void {}
  rect(): void {}
  arc(): void {}
  arcTo(): void {}
  ellipse(): void {}
}

if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = ServerDOMMatrix as unknown as typeof DOMMatrix;
}
if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = ServerPath2D as unknown as typeof Path2D;
}

export {};
