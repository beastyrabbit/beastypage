import { ProjectsSubNav } from "@/components/projects/ProjectsSubNav";

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ProjectsSubNav />
      {children}
    </>
  );
}
