import type { ReactNode } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

/* Shared shell for the wallet cards.

   This used to re-derive the `.glass` chassis by hand at a 24px radius that
   predates the radius scale. It is now the Card primitive with its header and
   body parts, so every wallet surface shares the one chassis in the product
   and the Vault's compact density comes from the same place as everywhere
   else. */
export function WalletCard({
  icon,
  title,
  caption,
  children,
  warm = false,
}: {
  icon: string;
  title: string;
  caption?: string;
  children: ReactNode;
  warm?: boolean;
}) {
  return (
    <Card
      variant={warm ? "warm" : "default"}
      pad="none"
      render={<section />}
      className="pb-4 md:pb-3"
    >
      <CardHeader
        icon={icon}
        title={title}
        hint={caption}
        className="px-4 pt-4 sm:px-4 sm:pt-4 md:px-3 md:pt-3"
      />
      <CardBody className="px-4 py-3 sm:px-4 sm:py-3 md:px-3 md:py-2.5">
        {children}
      </CardBody>
    </Card>
  );
}
