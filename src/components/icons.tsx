import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function DashboardIcon(props: IconProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="5" rx="2" />
      <rect x="13" y="10" width="8" height="11" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
    </svg>
  );
}

export function ProjectIcon(props: IconProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6Z" />
      <path d="M8 12h8M8 16h5" />
    </svg>
  );
}

export function AttendanceIcon(props: IconProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <rect x="3" y="4" width="18" height="17" rx="3" />
      <path d="M8 2v4M16 2v4M3 10h18M8.5 15l2.2 2 4.8-5" />
    </svg>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <rect x="2.5" y="5" width="19" height="14" rx="3" />
      <path d="M15 12h6M17.5 12a.5.5 0 1 0 0 .01" />
      <path d="M6 5V4a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CashInIcon(props: IconProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <rect x="2.5" y="5" width="19" height="14" rx="3" />
      <path d="M12 8v8M8 12h8M4.5 9.5h2M17.5 14.5h2" />
    </svg>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <path d="M12 16V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <rect x="4" y="14" width="16" height="6" rx="2" />
    </svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EditIcon(props: IconProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <path d="M4 20h4.5l9.7-9.7a2.1 2.1 0 0 0 0-3L16.8 5a2.1 2.1 0 0 0-3 0L4 14.6V20Z" />
      <path d="m12.8 6.2 5 5" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <path d="M4.5 7h15" />
      <path d="M9.5 3h5l1 2.5h3v2H5.5v-2h3L9.5 3Z" />
      <path d="m7.5 7 .8 12a2 2 0 0 0 2 1.9h3.4a2 2 0 0 0 2-1.9l.8-12" />
      <path d="M10 11.5v5M14 11.5v5" />
    </svg>
  );
}

export function SaveIcon(props: IconProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <path d="M4 4h13l3 3v13H4z" />
      <path d="M8 4v6h8V4M8 20v-6h8v6" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.8-3.8" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function PdfIcon(props: IconProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M14 3v5h5" />
      <path d="M8 16h8M8 19h6M9 11h.5M12 11h.5M15 11h.5" />
    </svg>
  );
}

export function ExcelIcon(props: IconProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M14 3v5h5" />
      <path d="m9 11 4 6m0-6-4 6M16.5 11v6" />
    </svg>
  );
}

export function DetailIcon(props: IconProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h6" />
    </svg>
  );
}

export function ImportIcon(props: IconProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <path d="M12 3v10" />
      <path d="m8 9 4 4 4-4" />
      <rect x="4" y="14" width="16" height="7" rx="2" />
    </svg>
  );
}

export function LogsIcon(props: IconProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M7 8h10M7 12h10M7 16h6" />
      <path d="M16.5 16h.01" />
    </svg>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M10 16 6 12l4-4" />
      <path d="M6 12h10" />
      <path d="M4 4h6" />
      <path d="M4 20h6" />
    </svg>
  );
}
