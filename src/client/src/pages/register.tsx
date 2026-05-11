import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import axios, { type AxiosError } from 'axios'
import { useNavigate } from 'react-router-dom'

function resolveApiBaseUrl() {
	const maybeMeta = (globalThis as any).import?.meta
	const configuredUrl = maybeMeta?.env?.VITE_API_URL
	return (configuredUrl || 'http://localhost:3000').replace(/\/$/, '')
}

function RegisterPage() {
	const navigate = useNavigate()
	const [formData, setFormData] = useState({
		username: '',
		email: '',
		password: '',
	})
	const [loading, setLoading] = useState(false)
	const [status, setStatus] = useState({ type: '', message: '' })

	const apiBaseUrl = useMemo(() => resolveApiBaseUrl(), [])

	function onChange(event: ChangeEvent<HTMLInputElement>) {
		const { name, value } = event.target
		setFormData((prev) => ({ ...prev, [name]: value }))
		if (status.message) {
			setStatus({ type: '', message: '' })
		}
	}

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setLoading(true)
		setStatus({ type: '', message: '' })

		try {
			await axios.post(`${apiBaseUrl}/api/auth/register`, {
				username: formData.username,
				email: formData.email,
				password: formData.password,
			})

			navigate('/login', {
				replace: true,
				state: {
					successMessage: 'Account created successfully. Sign in with your new credentials.',
				},
			})
		} catch (error: unknown) {
			const axiosError = error as AxiosError<{ message?: string }>
			const message = axiosError.response?.data?.message || 'Registration failed. Please try again.'
			setStatus({ type: 'error', message })
		} finally {
			setLoading(false)
		}
	}

	return (
		<form className="auth-form" onSubmit={onSubmit}>
			<label>
				Username
				<input
					type="text"
					name="username"
					value={formData.username}
					onChange={onChange}
					placeholder="alex.rivera"
					minLength={3}
					maxLength={30}
					autoComplete="username"
					required
				/>
			</label>

			<label>
				Email
				<input
					type="email"
					name="email"
					value={formData.email}
					onChange={onChange}
					placeholder="name@company.com"
					autoComplete="email"
					required
				/>
			</label>

			<label>
				Password
				<input
					type="password"
					name="password"
					value={formData.password}
					onChange={onChange}
					placeholder="At least 8 characters"
					minLength={8}
					autoComplete="new-password"
					required
				/>
			</label>

			<button type="submit" className="submit" disabled={loading}>
				{loading ? 'Creating account...' : 'Create account'}
			</button>

			{status.message && (
				<p className={`status ${status.type}`} role="status" aria-live="polite">
					{status.message}
				</p>
			)}
		</form>
	)
}

export default RegisterPage
