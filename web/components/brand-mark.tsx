import Image from "next/image";
import Link from "next/link";

export function BrandMark({ preload = false }: { preload?: boolean }) {
  return (
    <Link className="brand-mark" href="/" aria-label="LoomCredit home">
      <Image
        className="brand-mark-image"
        src="/assets/loomcredit-logo.png"
        alt=""
        width={46}
        height={46}
        preload={preload}
        unoptimized
      />
      <span>
        <span className="brand-mark-name" translate="no">
          LoomCredit
        </span>
        <span className="brand-mark-tagline" translate="no">
          Evidence to capital
        </span>
      </span>
    </Link>
  );
}
