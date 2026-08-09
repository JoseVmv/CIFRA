type ClassValue = string | false | null | undefined;

/** Junta classes condicionais sem trazer uma dependência só para isso. */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ');
}
