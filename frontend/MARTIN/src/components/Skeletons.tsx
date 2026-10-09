/** Loading placeholders that mirror the final layout so nothing jumps. */

function TicketSkeleton() {
  return (
    <div className="ticket ticket--skel" aria-hidden="true">
      <div className="ticket__main">
        <div className="skel ticket__img" />
        <div className="ticket__body">
          <div className="skel skel--line" style={{ width: '40%' }} />
          <div className="skel skel--title" style={{ width: '85%' }} />
          <div className="skel skel--line" style={{ width: '65%' }} />
        </div>
      </div>
      <div className="ticket__perf" />
      <div className="ticket__foot">
        <div className="ticket__row">
          <div className="skel skel--price" />
          <div className="skel skel--line" style={{ width: '40%' }} />
        </div>
        <div className="ticket__row">
          <div className="skel skel--line" style={{ width: '35%' }} />
          <div className="skel skel--btn" />
        </div>
      </div>
    </div>
  );
}

function GroupSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div className="group" aria-hidden="true">
      <div className="group__head">
        <div style={{ flex: 1 }}>
          <div className="skel skel--h2" style={{ width: '55%' }} />
          <div className="skel skel--line" style={{ width: '30%' }} />
        </div>
        <div className="skel skel--pill" />
      </div>
      {Array.from({ length: cards }, (_, i) => (
        <TicketSkeleton key={i} />
      ))}
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div role="status" aria-label="Loading menus">
      <GroupSkeleton cards={2} />
      <GroupSkeleton cards={2} />
    </div>
  );
}

export function TodaySkeleton() {
  return (
    <div role="status" aria-label="Loading today's menus">
      <div className="masthead" aria-hidden="true">
        <div className="skel skel--line" style={{ width: '34%' }} />
        <div className="skel skel--display" style={{ width: '70%' }} />
        <div className="skel skel--seg" />
      </div>
      <div className="filterbar" aria-hidden="true">
        <div className="skel skel--seg" />
      </div>
      <div className="page-pad">
        <FeedSkeleton />
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="page-pad" role="status" aria-label="Loading mensas">
      <div className="skel skel--display" style={{ width: '45%', marginBottom: 20 }} />
      {Array.from({ length: rows }, (_, i) => (
        <div className="row row--skel" key={i} aria-hidden="true">
          <div style={{ flex: 1 }}>
            <div className="skel skel--title" style={{ width: '60%' }} />
            <div className="skel skel--line" style={{ width: '40%' }} />
          </div>
          <div className="skel skel--circle" />
          <div className="skel skel--circle" />
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="page-pad" role="status" aria-label="Loading">
      <div className="skel skel--line" style={{ width: '30%' }} />
      <div className="skel skel--display" style={{ width: '75%', margin: '10px 0 14px' }} />
      <div className="skel skel--hero" />
      <div className="skel skel--line" style={{ width: '90%', marginTop: 16 }} />
      <div className="skel skel--line" style={{ width: '70%' }} />
      <div className="skel skel--chart" />
    </div>
  );
}
