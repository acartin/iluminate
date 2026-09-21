import { lessons } from "@/content/site";

export function LessonList({ track }: { track?: "Designer" | "Animate" }) {
  const visibleLessons = track ? lessons.filter((lesson) => lesson.track === track) : lessons;
  return (
    <div className="lesson-list">
      {visibleLessons.map((lesson) => (
        <article className="lesson-row" key={`${lesson.track}-${lesson.number}`}>
          <div className="lesson-thumbnail" aria-hidden="true">
            <span>{lesson.track.slice(0, 1)}—{lesson.number}</span>
            <i>▶</i>
          </div>
          <div className="lesson-copy">
            <span className="section-index">{lesson.track} / {lesson.level}</span>
            <h3>{lesson.title}</h3>
            <p>{lesson.description}</p>
          </div>
          <span className="lesson-duration">{lesson.duration}</span>
        </article>
      ))}
    </div>
  );
}
