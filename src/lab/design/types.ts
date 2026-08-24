export type DesignScreenId =
  | 'chat'
  | 'mon'
  | 'mind-map'
  | 'mind-dex'
  | 'me'
  | 'incubation'
  | 'encounter';

export type DesignSelection = {
  screen: DesignScreenId;
  elementId: string;
  tag: string;
  classes: string[];
  text: string;
  dataPezzo?: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type DesignPatch = {
  id: string;
  label: string;
  target: string;
  scope: 'token' | 'component' | 'screen' | 'layout' | 'structure';
  cssText?: string;
  notes?: string[];
};

export type PreviewMessage =
  | { type: 'VINZ_DESIGN_READY'; screen: DesignScreenId }
  | { type: 'VINZ_DESIGN_SELECTION'; selection: DesignSelection }
  | { type: 'VINZ_DESIGN_ERROR'; message: string };

export type HostMessage =
  | { type: 'VINZ_DESIGN_SET_INSPECT'; enabled: boolean }
  | { type: 'VINZ_DESIGN_APPLY_CSS'; cssText: string }
  | { type: 'VINZ_DESIGN_CLEAR_PATCH' };
