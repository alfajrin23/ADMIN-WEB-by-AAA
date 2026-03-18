import { CheckIcon, CloseIcon } from "@/components/icons";
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  type AppPermissionMatrix,
} from "@/lib/roles";

type PermissionMatrixProps = {
  permissions: AppPermissionMatrix;
  editable?: boolean;
};

export function PermissionMatrix({
  permissions,
  editable = false,
}: PermissionMatrixProps) {
  return (
    <div className="permission-matrix">
      <table>
        <thead>
          <tr>
            <th className="text-left">Modul</th>
            {PERMISSION_ACTIONS.map((action) => (
              <th key={action.value} className="text-center">
                {action.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSION_MODULES.map((module) => (
            <tr key={module.value}>
              <td>
                <p className="text-sm font-semibold text-slate-900">{module.label}</p>
                <p className="mt-1 text-xs text-slate-500">{module.description}</p>
              </td>
              {PERMISSION_ACTIONS.map((action) => {
                const checked = Boolean(permissions[module.value]?.[action.value]);
                return (
                  <td key={`${module.value}-${action.value}`} className="text-center">
                    {editable ? (
                      <label className="permission-toggle">
                        <input
                          type="checkbox"
                          name={`permission_${module.value}_${action.value}`}
                          value="1"
                          defaultChecked={checked}
                          aria-label={`${action.label} ${module.label}`}
                        />
                      </label>
                    ) : (
                      <span className="permission-toggle">
                        {checked ? (
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                            <CheckIcon className="h-4 w-4" />
                          </span>
                        ) : (
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                            <CloseIcon className="h-4 w-4" />
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
