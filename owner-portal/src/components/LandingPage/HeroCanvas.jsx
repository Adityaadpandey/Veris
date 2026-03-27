import { useRef, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'

function PerspectiveGrid() {
  const geometry = useMemo(() => new THREE.PlaneGeometry(80, 80, 40, 40), [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color('#FF5500'),
    wireframe: true,
    transparent: true,
    opacity: 0.08,
  }), [])

  return (
    <mesh
      geometry={geometry}
      material={material}
      rotation={[-Math.PI / 2.5, 0, 0]}
      position={[0, -4, -10]}
    />
  )
}

export default function HeroCanvas() {
  return (
    <Canvas
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      camera={{ position: [0, 2, 8], fov: 60 }}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={['#000000']} />
      <fog attach="fog" args={['#000000', 10, 40]} />
      <ambientLight intensity={0.1} />
      <pointLight position={[0, -2, -5]} color="#FF5500" intensity={2} distance={30} />
      <PerspectiveGrid />
    </Canvas>
  )
}
