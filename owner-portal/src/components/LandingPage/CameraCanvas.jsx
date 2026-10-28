import { useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function RaspberryPiBoard({ mouseY }) {
  const groupRef = useRef()

  useFrame(() => {
    if (!groupRef.current) return
    groupRef.current.rotation.y += 0.004
    groupRef.current.rotation.x = THREE.MathUtils.lerp(
      groupRef.current.rotation.x,
      mouseY * 0.3,
      0.05
    )
  })

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* PCB Board */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[4.2, 0.12, 2.8]} />
        <meshStandardMaterial color="#0d2010" roughness={0.6} metalness={0.3} />
      </mesh>

      {/* GPIO Header */}
      <mesh position={[-1.4, 0.1, -1.0]}>
        <boxGeometry args={[1.2, 0.1, 0.18]} />
        <meshStandardMaterial color="#1a2e1a" roughness={0.8} />
      </mesh>
      {Array.from({ length: 10 }).map((_, i) => (
        <mesh key={i} position={[-1.85 + i * 0.24, 0.17, -1.0]}>
          <boxGeometry args={[0.05, 0.14, 0.05]} />
          <meshStandardMaterial color="#c8a040" metalness={0.9} roughness={0.2} />
        </mesh>
      ))}

      {/* SoC Chip */}
      <mesh position={[-0.6, 0.1, 0.3]}>
        <boxGeometry args={[0.7, 0.08, 0.7]} />
        <meshStandardMaterial color="#111111" roughness={0.4} metalness={0.5} />
      </mesh>

      {/* RAM */}
      <mesh position={[0.2, 0.1, 0.3]}>
        <boxGeometry args={[0.55, 0.06, 0.4]} />
        <meshStandardMaterial color="#141414" roughness={0.4} metalness={0.5} />
      </mesh>

      {/* USB ports */}
      <mesh position={[1.7, 0.1, 0.5]}>
        <boxGeometry args={[0.55, 0.22, 0.22]} />
        <meshStandardMaterial color="#222222" roughness={0.7} />
      </mesh>
      <mesh position={[1.7, 0.1, 0.0]}>
        <boxGeometry args={[0.55, 0.22, 0.22]} />
        <meshStandardMaterial color="#222222" roughness={0.7} />
      </mesh>

      {/* Status LED */}
      <mesh position={[1.6, 0.12, -0.9]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#00ff44" emissive="#00ff44" emissiveIntensity={2} />
      </mesh>

      {/* Ribbon cable */}
      <mesh position={[0.9, 0.1, -1.1]}>
        <boxGeometry args={[0.5, 0.1, 0.2]} />
        <meshStandardMaterial color="#333" roughness={0.9} />
      </mesh>
      <mesh position={[1.8, 0.06, -1.1]}>
        <boxGeometry args={[0.8, 0.04, 0.18]} />
        <meshStandardMaterial color="#888888" roughness={0.5} metalness={0.1} />
      </mesh>

      {/* Camera module board */}
      <mesh position={[2.6, 0.0, -1.1]}>
        <boxGeometry args={[0.9, 0.1, 0.9]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.5} metalness={0.3} />
      </mesh>

      {/* Lens outer ring */}
      <mesh position={[2.6, 0.12, -1.1]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.3, 0.04, 16, 32]} />
        <meshStandardMaterial color="#FF5500" emissive="#FF5500" emissiveIntensity={0.4} roughness={0.3} metalness={0.6} />
      </mesh>

      {/* Lens middle ring */}
      <mesh position={[2.6, 0.12, -1.1]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.2, 0.025, 16, 32]} />
        <meshStandardMaterial color="#FF5500" emissive="#FF5500" emissiveIntensity={0.25} roughness={0.4} />
      </mesh>

      {/* Lens core */}
      <mesh position={[2.6, 0.12, -1.1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.05, 32]} />
        <meshStandardMaterial color="#050505" roughness={0.1} metalness={0.8} />
      </mesh>

      <pointLight position={[2.6, 0.5, -1.1]} color="#FF5500" intensity={1.5} distance={5} />
    </group>
  )
}

export default function CameraCanvas() {
  const [mouse, setMouse] = useState({ x: 0, y: 0 })

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMouse({
      x: ((e.clientX - rect.left) / rect.width - 0.5) * 2,
      y: ((e.clientY - rect.top) / rect.height - 0.5) * -2,
    })
  }

  return (
    <div style={{ width: '100%', height: '500px', position: 'relative' }} onMouseMove={handleMouseMove}>
      <Canvas camera={{ position: [0, 3, 8], fov: 45 }} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={['#000000']} />
        <ambientLight intensity={0.3} />
        <directionalLight position={[5, 5, 5]} intensity={1} color="#ffffff" />
        <pointLight position={[-3, 2, 3]} color="#FF5500" intensity={0.8} distance={15} />
        <RaspberryPiBoard mouseX={mouse.x} mouseY={mouse.y} />
      </Canvas>
    </div>
  )
}
