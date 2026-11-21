import type { Department } from '@store/shared';

import type { StringKey, TFunction } from '../../i18n';

// The display name of a department, translated at render. The slug is the URL and the colour key;
// the English `name` on the shared constant is only the source text.
export function departmentName(t: TFunction, dept: Pick<Department, 'slug'>): string {
  return t(`shell.department.${dept.slug}` as StringKey);
}
