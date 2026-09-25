import { ProjectsSubNav } from "@/components/projects/ProjectsSubNav";

export default function ProjectsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <ProjectsSubNav />
      {children}
    </>
  );
}
