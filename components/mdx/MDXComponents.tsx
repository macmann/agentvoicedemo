import type { MDXComponents as MDXComponentMap } from "mdx/types";
import Link from "next/link";

export const MDXComponents: MDXComponentMap = {
  a: ({ href = "", ...props }) => {
    const isInternal = href.startsWith("/") || href.startsWith("#");
    if (isInternal) {
      return <Link href={href} {...props} />;
    }
    return <a href={href} target="_blank" rel="noreferrer" {...props} />;
  }
};
