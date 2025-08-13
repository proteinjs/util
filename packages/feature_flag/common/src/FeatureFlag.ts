export abstract class FeatureFlag {
  protected _featureName: string;
  protected _isEnabled: boolean;

  constructor(featureName: string, isEnabled: boolean) {
    this._featureName = featureName;
    this._isEnabled = isEnabled;
  }

  async isEnabled(): Promise<boolean> {
    return this._isEnabled;
  }

  async setIsEnabled(isEnabled: boolean): Promise<void> {
    this._isEnabled = isEnabled;
  }
}
