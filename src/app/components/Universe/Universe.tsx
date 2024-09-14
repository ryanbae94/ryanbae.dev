'use client';

import React, { useEffect, useState } from 'react';
import styles from './Universe.module.css';

interface StarProps {
	style: React.CSSProperties;
}

const Star: React.FC<StarProps> = ({ style }) => (
	<div className={styles.star} style={style} />
);

export default function Universe() {
	const [stars, setStars] = useState<React.ReactNode[]>([]);

	useEffect(() => {
		const newStars = Array.from({ length: 300 }, (_, i) => (
			<Star
				key={i}
				style={{
					width: `${Math.random() * 3}px`,
					height: `${Math.random() * 3}px`,
					left: `${Math.random() * 100}%`,
					top: `${Math.random() * 100}%`,
					transform: `translateZ(${Math.random() * -1000}px)`,
					animationDuration: `${Math.random() * 2}s`,
				}}
			/>
		));
		setStars(newStars);
	}, []);
	return (
		<div className={styles.universe}>
			<div className={styles.space}>{stars}</div>
		</div>
	);
}
