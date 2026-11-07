export type BookBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type BookCrop = { id: string; blob: Blob; bounds: BookBounds };
export type CropsEvent = {
  photoId: string;
  crops: BookCrop[];
  source: 'detector' | 'whole-photo';
  dimensions: { width: number; height: number };
};
export type WarningEvent = { photoId: string; message: string };
export type DoneEvent = {
  photoId: string;
  status: 'complete' | 'cancelled' | 'error';
};
export type RecognitionCallbacks = {
  onCrops: (event: CropsEvent) => void;
  onWarning?: (event: WarningEvent) => void;
  onDone?: (event: DoneEvent) => void;
};
export type RecognitionEvent =
  | ({ type: 'crops' } & CropsEvent)
  | ({ type: 'warning' } & WarningEvent)
  | ({ type: 'done' } & DoneEvent);
