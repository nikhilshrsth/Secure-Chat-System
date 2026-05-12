import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import axios, { type AxiosError } from 'axios'
import { useLocation, useNavigate } from 'react-router-dom'

function resolveApiBaseUrl() {
	const maybeMeta = (globalThis as any).import?.meta
	const configuredUrl = maybeMeta?.env?.VITE_API_URL
	return (configuredUrl || 'http://localhost:3000').replace(/\/$/, '')
}

function LoginPage() {
	const location = useLocation()
	const navigate = useNavigate()
	const [formData, setFormData] = useState({
		email: '',
		password: '',
	})
	const [loading, setLoading] = useState(false)
	const [status, setStatus] = useState(() => {
		if (location.state?.successMessage) {
			return {
				type: 'success',
				message: location.state.successMessage,
			}
		}

		return { type: '', message: '' }
	})

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
			const response = await axios.post(`${apiBaseUrl}/api/auth/login`, {
				email: formData.email,
				password: formData.password,
			})

			localStorage.setItem('secureChatToken', response.data.token)
			localStorage.setItem('secureChatUser', JSON.stringify(response.data.user))
			navigate('/profile', { replace: true })
			setStatus({ type: 'success', message: `Welcome back, ${response.data.user.username}.` })
		} catch (error: unknown) {
			const axiosError = error as AxiosError<{ message?: string }>
			const message = axiosError.response?.data?.message || 'Sign in failed. Please try again.'
			setStatus({ type: 'error', message })
		} finally {
			setLoading(false)
		}
	}

	return (
		<form className="auth-form" onSubmit={onSubmit}>
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
					placeholder="Enter your password"
					minLength={8}
					autoComplete="current-password"
					required
				/>
			</label>

			<button type="submit" className="submit" disabled={loading}>
				{loading ? 'Signing in...' : 'Sign in'}
			</button>

			{status.message && (
				<p className={`status ${status.type}`} role="status" aria-live="polite">
					{status.message}
				</p>
			)}
		</form>
	)
}

export default LoginPage
