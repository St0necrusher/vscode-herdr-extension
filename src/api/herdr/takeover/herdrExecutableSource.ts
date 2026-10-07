export interface HerdrExecutableSource {
  read(): Readonly<{ executable: string }>;
}
