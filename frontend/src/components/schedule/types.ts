export interface Shift {
  id: string;
  userId: string;
  type: string;
  startTime: string;
  endTime: string;
  isConfirmed: boolean;
  notes?: string | null;
  swapRequested: boolean;
  swapRequestedTo?: string | null;
  swapApproved?: boolean | null;
  swapTarget?: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string;
  } | null;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface ShiftTemplate {
  id: string;
  name: string;
  startHour: number;
  endHour: number;
  color?: string;
}

